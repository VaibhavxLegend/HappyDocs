class CreateUserDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsNumber()
  age: number;
}

class UserDto {
  id: string;
  email: string;
}

@ApiTags("Users")
@UseGuards(AuthGuard)
@Controller("users")
export class UsersController {
  @Get(":id")
  @ApiOperation({ summary: "Get a user", description: "Finds a user by identifier." })
  getOne(
    @Param("id") id: string,
    @Query("page") page?: number,
    @Headers("authorization") authorization?: string
  ): UserDto {
    return { id, email: "example@example.com" };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: "Create a user" })
  @ApiResponse({ status: 201, description: "User created", type: UserDto })
  create(@Body() payload: CreateUserDto): UserDto {
    return { id: "1", email: payload.email };
  }
}
